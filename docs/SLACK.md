# Slack

Holmes integrates with Slack to provide a "/fingerprint" command
that exposes most operations.

## Slack Configuration

Configuration of the app in Slack is a nightmare - due to Slack continually
changing the UI but also seemingly having no coherent plan for where
app configuration lives.

As a Slack admin, you need to find the Holmes app - there should
be one for dev and prod. Keep digging - there are at least 3 "app" pages
that all give different details. You need to "manage" the app to change
the desired settings.

They need to be installed into the Slack instance and somehow tied
to the channel they report into. This seems like it can be done both from
the app end _and_ inside the channel itself - but it was a lottery as to
which one actually worked.

If the PublicSlackUrl of the CDK stack changes - then it needs to be changed
in the Slack configuration as well.

The following is an example app manifest

```json
{
  "display_information": {
    "name": "Holmes (prod)",
    "description": "BAM fingerprinting",
    "background_color": "#b01a40"
  },
  "features": {
    "bot_user": {
      "display_name": "Holmes",
      "always_online": true
    },
    "slash_commands": [
      {
        "command": "/fingerprint",
        "url": "https://thelambdaurlfromaws.lambda-url.ap-southeast-2.on.aws",
        "description": "Interact with the Holmes fingerprint service",
        "usage_hint": "[listx checkx relatex list check relate]",
        "should_escape": false
      }
    ]
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "chat:write",
        "chat:write.customize",
        "commands",
        "incoming-webhook",
        "files:write",
        "chat:write.public"
      ]
    }
  },
  "settings": {
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

Unfortunately this is the best I can do - the UI pages make no sense.

Keep in mind that the app needs Slack commands in order to interact in a channel and it needs OAuth scopes
in order that it can spontaneously write in the channel (this is for the daily sequencing report -
but to be honest the Slack commands _also_ need this functionality as they post back into
the channel on request).

## Slack Secrets

Various settings from the app need to be put into an AWS secret called
SlackApps. These settings appear in various places in the Slack app
management - and normally need to be "revealed" to copy them across.

The AWS secret has content like

```json
{
  "Holmes": {
    "AppID": "A000000000",
    "SigningSecret": "alonglowercasehexstring", // pragma: allowlist secret
    "BotUserOAuthToken": "xoxb-stuff"
  }
}
```
