The code here is

- A lambda/Docker for execution by Cron
- A handler for Slack commands (WIP)

Basically this started as a CLI and has migrated to being a
Lambda. We have tried to keep the CLI tool functionality
by making it available via Slack commands.

## Lambda

The Lambda is deployed via CDK and tied to a regular Cron
schedule. Its output will go to the correct Slack channel
depending on the environment.
