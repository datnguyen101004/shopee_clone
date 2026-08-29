# Development CI/CD

Every push to `development` runs CI, publishes immutable API and migrator images to Docker Hub,
applies pending Prisma migrations to Aurora from the EC2 host, and recreates the API container. E2E
and seed commands are deliberately excluded from this demo pipeline.

## Pipeline order

1. Install the pinned Node.js and pnpm versions.
2. Validate Compose, Prisma, API/contracts lint, types, database-independent tests, and production
   builds. API tests under `apps/api/test`, frontend tests, and browser E2E suites are excluded because
   this pipeline deploys only the backend.
3. Build and push both Docker targets with the full Git commit SHA and the convenience tag
   `development`.
4. Assume a narrowly scoped AWS role through GitHub OIDC.
5. Send an `AWS-RunShellScript` command to the EC2 instance through Systems Manager.
6. Validate and atomically update `compose-prod.yaml`, retaining the previous file as
   `compose-prod.yaml.previous`.
7. Pull both immutable images, run `prisma migrate deploy`, recreate the API, and wait for a healthy
   container.

Migration runs before API replacement. If migration fails, the existing API is not recreated. A
successful migration is not rolled back if the new API later fails its healthcheck, so production
migrations must remain backward compatible with the previously deployed API.

## GitHub configuration

Create these repository variables:

| Variable | Demo value |
| --- | --- |
| `DOCKERHUB_USERNAME` | `datnguyen10102004` |
| `AWS_REGION` | `ap-southeast-1` |
| `EC2_INSTANCE_ID` | `i-0062d6d056196fe6e` |
| `EC2_DEPLOY_PATH` | `/usr/bin/shopee-clone` |

Create these GitHub secrets:

| Secret | Purpose |
| --- | --- |
| `DOCKERHUB_TOKEN` | Docker Hub access token with permission to push both repositories |
| `AWS_ROLE_TO_ASSUME` | ARN of the IAM role trusted by GitHub OIDC |

Do not store `DATABASE_URL` in GitHub. Migration runs on EC2 and reads the existing
`.env.production` file locally through `compose-prod.yaml`.

## GitHub OIDC role

Add the GitHub OIDC provider `https://token.actions.githubusercontent.com` with audience
`sts.amazonaws.com` to the AWS account. Use this trust policy for the deployment role, replacing
`AWS_ACCOUNT_ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::AWS_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:datnguyen101004@118203091/shopee_clone@1331667895:ref:refs/heads/development"
        }
      }
    }
  ]
}
```

The subject uses this repository's immutable GitHub owner and repository IDs, and limits role
assumption to the `development` branch.

Attach this minimum deployment policy, replacing `AWS_ACCOUNT_ID` if the instance changes:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RunDeploymentOnDemoInstance",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:ap-southeast-1::document/AWS-RunShellScript",
        "arn:aws:ec2:ap-southeast-1:AWS_ACCOUNT_ID:instance/i-0062d6d056196fe6e"
      ]
    },
    {
      "Sid": "ReadDeploymentResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

## EC2 prerequisites

- The instance is online in Systems Manager and its instance profile includes
  `AmazonSSMManagedInstanceCore`.
- Docker Engine and Docker Compose v2 are installed.
- `/usr/bin/shopee-clone/compose-prod.yaml` exists; every deployment validates and synchronizes it
  from the repository before migration.
- `/usr/bin/shopee-clone/.env.production` exists and contains the production runtime configuration.
- The EC2 security group can reach Aurora, and the instance role has any application permissions
  needed for S3 or other AWS services.
- If either Docker Hub repository is private, perform `docker login` once on EC2 with a read-only
  token. Public repositories need no EC2 registry credentials.

The workflow deploys the exact commit SHA rather than the mutable `development` tag, making each
deployment traceable to one Git revision.
