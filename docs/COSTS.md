# AWS Cost Estimates

Sydney pricing

https://aws.amazon.com/fargate/pricing
https://aws.amazon.com/lambda/pricing

```text
fargate intel per vCPU =	($0.04856 USD in AUD) per hour = $0.066135078/hour
fargate intel per GB per vCPU = ($0.00532 USD in AUD) per hour = $0.007245441/hour
fargate arm per vCPU =($0.03885 USD in AUD) per hour = $0.0529107862/hour
fargate arm per GB = ($0.00426 USD in AUD) per hour = $0.0058018005/hour
fargate intel spot per vCPU = ($0.014568 USD in AUD) per hour = $0.0198405234/hour
fargate intel spot per GB = ($0.001596 USD in AUD) per hour = $0.0021736323/hour
lambda intel price per GB  = ($0.0000166667  USD in AUD) per second = $0.0000226988/s
lambda intel price per request = ($0.20 / 1 million USD in AUD) = $0.000000146850965
lambda arm price per GB = ($0.0000133334 USD in AUD) per second = $0.0000181591/s
lambda arm price per request = ($0.20 / 1 million USD in AUD) = $0.000000146850965
```

## Extraction costing

The settings for our task (changing this may change average extract time)

```
GB = 4
vCPU = 1
```

From test runs this is how long somalier seems to take on our average
files a mix of some very quick (1min), some 10mins and some 20mins

```
average extract time = 15 minutes
average cost = (average extract time × fargate intel per vCPU x vCPU) + (average extract time x fargate intel per GB per vCPU x vCPU x GB) = $0.0237792105
```

All data is in the same region and should come in via s3 gateway (estimate of docker pull costs across vpc endpoint?)

```
data transfer costs = $0
estimated number of samples = 1,000 units
estimated number of samples x average cost + data transfer costs = $23.78
```

## Check costing

```text
GB = 0.5

average check time = 15s
number checked per lambda =  10

average cost = (average check time x lambda intel price per GB x GB) + lambda intel price per request = $0.0001703878

average cost = estimated number of samples / number checked per lambda x average cost = $0.0170387816

```
