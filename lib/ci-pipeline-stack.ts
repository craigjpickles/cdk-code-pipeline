import * as cdk from 'aws-cdk-lib/core'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as ssm from 'aws-cdk-lib/aws-ssm' // Add this line
import { Construct } from 'constructs'
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild'

export class CIPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    
    const stackName = new cdk.CfnParameter(this, 'StackName', {
      type: 'String',
      description: 'lowercase name of stack',
    })

    const repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
      type: 'String',
      description: 'Name of the Project',
    })

    const repositoryOwner = new cdk.CfnParameter(this, 'RepositoryOwner', {
      type: 'String',
      description: 'Repository Owner',
    })

    const branchName = new cdk.CfnParameter(this, 'BranchName', {
      type: 'String',
      description: 'Name of the branch',
      default: 'main',
    })

    const codeStarConnectionId = new cdk.CfnParameter(
      this,
      'CodeStarConnectionId',
      {
        type: 'String',
        description: 'The codestar connection ID',
      },
    )

    const branchTemplateName = new cdk.CfnParameter(
      this,
      'BranchTemplateName',
      {
        type: 'String',
        description: 'Name of the CF template',
        default: 'template.yaml',
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
                echo "The branch override is: $BranchOverride"
                
                if [ $BranchOverride != 'main' ]; then
                  BRANCH_NAME=$BranchOverride
                fi
                
                if [ $BRANCH_NAME == 'main' ]; then
                  echo "Deploying template TemplateName.yaml as stack '$STACK_NAME'"
                  aws cloudformation deploy --template-file packaged-template.yaml --parameter-overrides file://packaged-template-dev-params.json --stack-name $STACK_NAME --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset
                else
                  SANITISED_BRANCH=$(echo $BRANCH_NAME | sed 's/[\/\\]/-/g')
                  echo "The sanitised branch name is: $SANITISED_BRANCH"
                  MODIFIED_STACK_NAME=$STACK_NAME-$SANITISED_BRANCH
                  echo "Deploying template TemplateName.yaml as stack '$MODIFIED_STACK_NAME'"
                  aws cloudformation deploy --template-file packaged-template.yaml --parameter-overrides file://packaged-template-dev-params.json --stack-name $MODIFIED_STACK_NAME --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset
                fi
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

    const branchOverrideVariable = new codepipeline.Variable({
      variableName: 'BranchOverride',
      description: 'Override for branch name',
      defaultValue: 'main',
    })

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'CodePipelineCDKDemo-CI-Pipeline',
      executionMode: codepipeline.ExecutionMode.PARALLEL,
      role: pipelineRole,
      artifactBucket: artifactBucket,
      variables: [branchOverrideVariable],
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'App',
              owner: repositoryOwner.valueAsString,
              repo: repositoryName.valueAsString,
              branch: branchName.valueAsString,
              connectionArn: `arn:aws:codestar-connections:ap-southeast-2:${cdk.Aws.ACCOUNT_ID}:connection/${codeStarConnectionId.valueAsString}`,
              output: new codepipeline.Artifact('SCCheckoutArtifact'),
              role: buildRole,
              runOrder: 1,
              variablesNamespace: 'SourceVariables',
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'BuildAndPackage',
              project: buildProject,
              input: new codepipeline.Artifact('SCCheckoutArtifact'),
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
                  value: '#{SourceVariables.BranchName}',
                },
                BranchOverride: { value: '#{variables.BranchOverride}'},
                AccountNumber: { value: nonProductionAccount.valueAsString },
                RoleArn: { value: crossAccountDeployerRoleName },
                StackName: { value: stackName.valueAsString },
              },
            }),
          ],
        },
      ],
    })
  }
}
