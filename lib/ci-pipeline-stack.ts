import * as cdk from 'aws-cdk-lib/core'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as events from 'aws-cdk-lib/aws-events'
import * as events_targets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as ssm from 'aws-cdk-lib/aws-ssm' // Add this line
import { Construct } from 'constructs'
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild'
import { GitPullRequestEvent } from 'aws-cdk-lib/aws-codepipeline'

export class CIPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const branchName = new cdk.CfnParameter(this, 'BranchName', {
      type: 'String',
      description: 'Name of the branch',
      default: 'main',
    })

    const branchTemplateName = new cdk.CfnParameter(
      this,
      'BranchTemplateName',
      {
        type: 'String',
        description: 'Name of the CF template',
        default: 'template.yaml',
      },
    )

    const codeStarConnectionId = new cdk.CfnParameter(
      this,
      'CodeStarConnectionId',
      {
        type: 'String',
        description: 'The codestar connection ID',
      },
    )

    const dependencyFolders = new cdk.CfnParameter(this, 'DependencyFolders', {
      type: 'String',
      description:
        'csv list of folders in the source repo to be copied to the dependency bucket',
      default: '',
    })

    const nonProductionAccount = new cdk.CfnParameter(
      this,
      'NonProductionAccount',
      {
        type: 'Number',
        description: 'AWS AccountNumber for Non-Production',
      },
    )

    const repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
      type: 'String',
      description: 'Name of the Project',
    })

    const repositoryOwner = new cdk.CfnParameter(this, 'RepositoryOwner', {
      type: 'String',
      description: 'Repository Owner',
    })

    const stackName = new cdk.CfnParameter(this, 'StackName', {
      type: 'String',
      description: 'lowercase name of stack',
    })

    const artifactBucketName = ssm.StringParameter.valueForStringParameter(
      this,
      '/CodePipelineCDK/CommonResources/S3Bucket',
    )

    const encryptionKeyArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/CodePipelineCDK/CommonResources/CMKARN',
    )

    const pipelineRoleArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/CodePipelineCDK/CommonResources/PipelineRoleARN',
    )

    const buildRoleArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/CodePipelineCDK/CommonResources/BuildProjectRoleARN',
    )

    const crossAccountDeployerRoleName =
      ssm.StringParameter.valueForStringParameter(
        this,
        '/CodePipelineCDK/CommonResources/CrossAccountDeployerRoleName',
      )

    const artifactBucket = s3.Bucket.fromBucketName(
      this,
      'ArtifactBucket',
      artifactBucketName,
    )

    const encryptionKey = kms.Key.fromKeyArn(
      this,
      'EncryptionKey',
      encryptionKeyArn,
    )

    const pipelineRole = iam.Role.fromRoleArn(
      this,
      'PipelineRole',
      pipelineRoleArn,
    )

    const buildRole = iam.Role.fromRoleArn(this, 'BuildRole', buildRoleArn)

    // build project
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      description: stackName.valueAsString,
      encryptionKey: encryptionKey,
      environment: {
        computeType: codebuild.ComputeType.SMALL,
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
        environmentVariables: {
          S3Bucket: {
            value: artifactBucketName,
          },
          S3BuildsPrefix: { value: cdk.Fn.sub('${StackName}/builds') },
          TemplateName: { value: branchTemplateName.valueAsString },
          KMSKey: {
            value: encryptionKeyArn,
          },
          DependencyFolders: { value: dependencyFolders.valueAsString },
        },
      },
      role: buildRole,
      queuedTimeout: cdk.Duration.minutes(10),
    })

    // deploy project
    const deployBuildProject = new codebuild.PipelineProject(
      this,
      'DeployBuildProject',
      {
        description: `${stackName.valueAsString} - Deploy Build`,
        encryptionKey: encryptionKey,
        environment: {
          computeType: codebuild.ComputeType.SMALL,
          buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            build: {
              commands: `
                RESPONSE=$(aws sts assume-role --role-arn arn:aws:iam::$AccountNumber:role/$RoleArn --role-session-name $(date "+%Y%m%d_%H%M%S"))
                export AWS_ACCESS_KEY_ID=$(echo $RESPONSE | jq -r '.Credentials.AccessKeyId')
                export AWS_SECRET_ACCESS_KEY=$(echo $RESPONSE | jq -r '.Credentials.SecretAccessKey')
                export AWS_SESSION_TOKEN=$(echo $RESPONSE | jq -r '.Credentials.SessionToken')
                
                STACK_NAME="$StackName-dev"
                BRANCH_NAME=$BranchName
                echo "The branch name is: $BRANCH_NAME"

                SANITISED_BRANCH=$(echo $BRANCH_NAME | sed 's/[\/\\]/-/g')
                echo "The sanitised branch name is: $SANITISED_BRANCH"
                MODIFIED_STACK_NAME=$STACK_NAME-$SANITISED_BRANCH
                echo "Deploying template TemplateName.yaml as stack '$MODIFIED_STACK_NAME'"
                aws cloudformation deploy --template-file packaged-template.yaml --parameter-overrides file://packaged-template-dev-params.json --stack-name $MODIFIED_STACK_NAME --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset
            `,
            },
          },
          artifacts: {
            files: ['**/*'],
            'discard-paths': 'yes',
          },
        }),
        role: buildRole,
        queuedTimeout: cdk.Duration.minutes(10),
      },
    )

    const codeStarConnectionArn = `arn:aws:codestar-connections:ap-southeast-2:${cdk.Aws.ACCOUNT_ID}:connection/${codeStarConnectionId.valueAsString}`

    // source action
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: 'Source',
        owner: repositoryOwner.valueAsString,
        repo: repositoryName.valueAsString,
        connectionArn: codeStarConnectionArn,
        output: new codepipeline.Artifact('SourceArtifact'),
        role: buildRole,
        runOrder: 1,
        variablesNamespace: 'SourceVariables',
      })

    // pipeline triggers
    const triggerProps: codepipeline.TriggerProps[] = [
      {
        providerType: codepipeline.ProviderType.CODE_STAR_SOURCE_CONNECTION,
        gitConfiguration: {
          sourceAction: sourceAction,
          pullRequestFilter: [
            {
              branchesIncludes: ['**'],
              events: [GitPullRequestEvent.OPEN, GitPullRequestEvent.UPDATED],
            },
          ],
        },
      },
    ]

    // pipeline definition
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'CodePipelineCDKDemo-CI-Pipeline',
      executionMode: codepipeline.ExecutionMode.PARALLEL,
      role: pipelineRole,
      artifactBucket: artifactBucket,
      triggers: triggerProps,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'BuildAndPackage',
              project: buildProject,
              input: new codepipeline.Artifact('SourceArtifact'),
              outputs: [new codepipeline.Artifact('BuildOutput')],
              role: pipelineRole,
              runOrder: 1,
            }),
          ],
        },
        {
          stageName: 'DeployDev',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Deploy',
              project: deployBuildProject,
              input: new codepipeline.Artifact('BuildOutput'),
              outputs: [new codepipeline.Artifact('DeployOutput')],
              role: pipelineRole,
              runOrder: 1,
              environmentVariables: {
                BranchName: {
                  value: '#{SourceVariables.SourceBranchName}',
                },
                AccountNumber: { value: nonProductionAccount.valueAsString },
                RoleArn: { value: crossAccountDeployerRoleName },
                StackName: { value: stackName.valueAsString },
              },
            }),
          ],
        },
      ],
    })

    // Create a Lambda function to handle the event
    const pipelineStatusLambda = new lambda.Function(
      this,
      'PipelineStatusLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
          const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
          const { CodePipelineClient, GetPipelineExecutionCommand } = require('@aws-sdk/client-codepipeline');
          const https = require('https');
  
          const secretsManagerClient = new SecretsManagerClient({});
          const codePipelineClient = new CodePipelineClient({});
  
          exports.handler = async (event) => {
            try {
              console.log('Event:', JSON.stringify(event));
    
              const pipelineName = event.detail.pipeline;
              const executionId = event.detail['execution-id'];
              const state = event.detail.state;
    
              // PR request ID
              const executionTrigger = event.detail['execution-trigger'];
              const triggerDetail = JSON.parse(executionTrigger['trigger-detail']);
              const pullRequestId = triggerDetail.pullRequestId;

              const params = {
                pipelineName,
                pipelineExecutionId: executionId,
              };
      
              const command = new GetPipelineExecutionCommand(params);
              const data = await codePipelineClient.send(command);
    
              const executionStatus = data.pipelineExecution.status;
           
              const getSecretCommand = new GetSecretValueCommand({
                SecretId: process.env.GITHUB_TOKEN_SECRET_NAME,
              });
              const secretValue = await secretsManagerClient.send(getSecretCommand);

              const githubToken = JSON.parse(secretValue.SecretString).token;

              const options = {
                hostname: 'api.github.com',
                path: \`/repos/\${process.env.REPO_OWNER}/\${process.env.REPO_NAME}/issues/\${pullRequestId}/comments\`,
                method: 'POST',
                headers: {
                  'Accept': 'application/vnd.github+json',
                  'Authorization': \`Bearer \${githubToken}\`,
                  'User-Agent': 'AWS Lambda',
                  'Content-Type': 'application/json',
                  'X-GitHub-Api-Version': '2022-11-28',
                },
              };
    
              const commentBody = JSON.stringify({
                  body: \`CodePipeline Execution Update:
                  - Pipeline: \${pipelineName}
                  - Execution ID: \${executionId}
                  - Status: \${executionStatus}\`
              });

              await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                  let responseBody = '';

                  res.on('data', (chunk) => {
                    responseBody += chunk;
                  });

                  res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                      resolve(responseBody);
                    } else {
                      reject(new Error(\`GitHub API responded with status \${res.statusCode}: \${responseBody}\`));
                    }
                  });
                });

                req.on('error', (error) => {
                  reject(error);
                });

                req.write(commentBody);
                req.end();
              });

              return {
                statusCode: 200,
                body: JSON.stringify({ 
                  message: 'GitHub PR comment added successfully',
                  pipelineDetails: { pipelineName, executionId, executionStatus }
                })
              };
            } catch (error) {
              console.error('Error processing CodePipeline event:', error);
            
              return {
                statusCode: 500,
                body: JSON.stringify({ 
                  message: 'Failed to add GitHub PR comment',
                  error: error.message 
                })
              };
            }
          }
        `),
        environment: {
          GITHUB_TOKEN_SECRET_NAME: '/CodePipeline/GitHubToken',
          REPO_NAME: repositoryName.valueAsString,
          REPO_OWNER: repositoryOwner.valueAsString,
        },
      },
    )

    // Grant the Lambda function permissions to read the pipeline status
    pipelineStatusLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codepipeline:GetPipelineExecution'],
        resources: ['*'],
      }),
    )

    // secrets manager permissions
    pipelineStatusLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:*`,
        ],
      }),
    )

    // Create an EventBridge rule to detect pipeline state changes
    const rule = new events.Rule(this, 'PipelineStateChangeRule', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [pipeline.pipelineName],
          state: ['STARTED', 'SUCCEEDED', 'FAILED'],
        },
      },
    })

    // Add the Lambda function as the target of the rule
    rule.addTarget(new events_targets.LambdaFunction(pipelineStatusLambda))
  }
}
