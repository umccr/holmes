import * as path from "path";
import {Duration, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {DockerImageAsset} from 'aws-cdk-lib/aws-ecr-assets';
import {DockerImageCode, DockerImageFunction} from "aws-cdk-lib/aws-lambda";
import {ManagedPolicy, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {Map, StateMachine, Succeed} from "aws-cdk-lib/aws-stepfunctions";
import {LambdaInvoke} from "aws-cdk-lib/aws-stepfunctions-tasks";
import {Secret} from "aws-cdk-lib/aws-secretsmanager";
import {HttpNamespace, Service} from 'aws-cdk-lib/aws-servicediscovery';

export class HolmesStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // we need access to a ICA JWT in order to be able to download from GDS
        // we get this here in CDK so we can pass the ARN into the lambda via env variable
        const icaSecret = Secret.fromSecretNameV2(this, 'IcaJwt', 'IcaSecretsPortal');

        // create a single role that is used by all our step functions (could tighten this if needed)
        const permissions = ["service-role/AWSLambdaBasicExecutionRole", "AmazonS3ReadOnlyAccess"]

        const lambdaRole = new Role(this, id, {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        });

        icaSecret.grantRead(lambdaRole);

        permissions.map(permission => {
            lambdaRole.addManagedPolicy(
                ManagedPolicy.fromAwsManagedPolicyName(
                    permission
                )
            );
        })

        // the Docker asset shared by all steps
        const asset = this.addFingerprintDockerAsset();

        /*
           The gather function is used to collate the full list of fingerprints in the system - we could extend
           it to use a db or look at S3 etc. This is also performs the chunking for the Map stage
         */
        const gatherFunc = new DockerImageFunction(this, "FingerprintGatherFunction", {
            memorySize: 2048,
            timeout: Duration.seconds(180),
            role: lambdaRole,
            code: DockerImageCode.fromEcr(asset.repository, {tag: asset.assetHash, cmd: ['gather.lambdaHandler']}),
        });
        const gatherInvoke = new LambdaInvoke(this, "FingerprintGatherTask", {
            lambdaFunction: gatherFunc,
            outputPath: "$.Payload"
        });

        /*
         The check function is used to compare the index fingerprint against an array of other fingerprints
         */
        const checkFunc = new DockerImageFunction(this, "FingerprintCheckFunction", {
            memorySize: 2048,
            timeout: Duration.seconds(180),
            role: lambdaRole,
            code: DockerImageCode.fromEcr(asset.repository, {tag: asset.assetHash, cmd: ['check.lambdaHandler']}),
            environment: {
                SECRET_ARN: icaSecret.secretArn
            }
        });
        const checkInvoke = new LambdaInvoke(this, "FingerprintCheckTask", {
            lambdaFunction: checkFunc,
            outputPath: "$.Payload.matches"
        });

        // The Map invoke step is the parallel invocation according to the dynamic array input
        const mapInvoke = new Map(this, "FingerprintMapTask", {
            inputPath: "$",
            itemsPath: "$.fingerprintTasks",
            parameters: {
                "index.$": "$.index",
                "relatednessThreshold.$": "$.relatednessThreshold",
                "fingerprints.$": "$$.Map.Item.Value",
            },

        }).iterator(checkInvoke);


        const stateMachine = new StateMachine(this, 'StateMachine', {
            definition:
                gatherInvoke
                    .next(mapInvoke)
                    .next(new Succeed(this, "Collate"))
        });

        /* I don't understand CloudMap - there seems no way for me to import in a namespace that
        already exists.. other than providing *all* the details.. and a blank arn?? */
        // this seems to actually work though
        const namespace = HttpNamespace.fromHttpNamespaceAttributes(this, 'Namespace', {
            namespaceId: 'ns-mjt63c4ppdrly4jd',
            namespaceName: 'umccr',
            namespaceArn: ''
        });

        const service = new Service(this, 'Service', {
            namespace: namespace,
            name: 'fingerprint',
            description: 'Service for rapidly identifying existing BAM files with similar content'
        });

        service.registerNonIpInstance("Steps", {
            customAttributes: {
                stepsArn: stateMachine.stateMachineArn
            }
        });
    }

    /**
     * The fingerprint docker asset is a lambda containing multiple entrypoints for various stages of
     * the steps function.
     *
     * @private
     */
    private addFingerprintDockerAsset(): DockerImageAsset {
        const dockerImageFolder = path.join(__dirname, 'fingerprint-docker-image');

        return new DockerImageAsset(this, 'FingerprintDockerImage', {
            directory: dockerImageFolder,
            buildArgs: {}
        });
    }
}
