# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template


## Deploy commands

* Common Resources Stack - `cdk deploy CommonResourcesStack --parameters CrossAccountDeployerRoleName=CrossAccountDeployerRole --parameters CrossAccountPipelineRoleName=CrossAccountPipelineRole --parameters OrganisationId=<org-id>`
* CI Pipeline Stack - `cdk deploy CIPipelineStack --parameters BranchName=<branch-name> --parameters BranchTemplateName=<cf-template-name> --parameters ProductionAccount=<account-num> --parameters RepositoryName=<repo-name> --parameters StackName=<stack-name>`
* CD Pipeline Stack - `cdk deploy CDPipelineStack --parameters BranchName=<branch-name> --parameters BranchTemplateName=<cf-template-name> --parameters NonProductionAccount=<account-num> --parameters ProductionAccount=<account-num> --parameters RepositoryName=<repo-name> --parameters StackName=<stack-name>`


Example:
`cdk deploy CIPipelineStack --parameters BranchName=main --parameters BranchTemplateName=template/cf-stack --parameters NonProductionAccount=381492168869 --parameters RepositoryName=SampleWorkload --parameters StackName=CodePipelineCDKDemo`