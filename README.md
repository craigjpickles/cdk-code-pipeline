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

### Common Resources Stack
The following command can be used to deploy the stack:
    cdk deploy CommonResourcesStack \
    --parameters CrossAccountDeployerRoleName=CrossAccountDeployerRole \
    --parameters CrossAccountPipelineRoleName=CrossAccountPipelineRole \
    --parameters OrganisationId=<org-id>

### CI Pipeline Stack

The following command can be used to deploy the stack:

    cdk deploy CIPipelineStack \
    --parameters BranchName=<branch-name> \
    --parameters BranchTemplateName=<branch-template-name> \
    --parameters CodeStarConnectionId=<code-star-connection-id> \
    --parameters DependencyFolders=<dependency-folders> \
    --parameters NonProductionAccount=<account-number> \
    --parameters RepositoryName=<repo-name> \
    --parameters RepositoryOwner=<repo-owner> \
    --parameters StackName=<stack-name>


Example, with actual values:

    cdk deploy CIPipelineStack \
    --parameters BranchName=main \
    --parameters BranchTemplateName=template/cf-stack \
    --parameters CodeStarConnectionId=d1b54466-93f9-4482-a34d-a5bb39af7a25 \
    --parameters NonProductionAccount=381492168869 \
    --parameters RepositoryName=code-pipeline \
    --parameters RepositoryOwner=craigjpickles \
    --parameters StackName=CodePipelineCDKDemo

### CD Pipeline Stack
The following command can be used to deploy the stack:

    cdk deploy CDPipelineStack \
    --parameters BranchName=<branch-name> \
    --parameters BranchTemplateName=<branch-template-name> \
    --parameters CodeStarConnectionId=<code-star-connection-id> \
    --parameters DependencyFolders=<dependency-folders> \
    --parameters NonProductionAccount=<account-number> \
    --parameters ProductionAccount=<account-number> \    
    --parameters RepositoryName=<repo-name> \
    --parameters RepositoryOwner=<repo-owner> \
    --parameters StackName=<stack-name>


Example, with actual values:

    cdk deploy CDPipelineStack \
    --parameters BranchName=main \
    --parameters BranchTemplateName=template/cf-stack \
    --parameters CodeStarConnectionId=d1b54466-93f9-4482-a34d-a5bb39af7a25 \
    --parameters NonProductionAccount=381492168869 \
    --parameters ProductionAccount=637423600161 \
    --parameters RepositoryName=code-pipeline \
    --parameters RepositoryOwner=craigjpickles \
    --parameters StackName=CodePipelineCDKDemo