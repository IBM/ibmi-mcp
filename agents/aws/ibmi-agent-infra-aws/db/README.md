## Managing your database

This guide outlines the steps for manage your database:

1. Creating new tables
2. Upgrading existing tables

## Table of Contents

- [Create or Update tables](#create-or-update-tables)
- [Running Migrations](#running-migrations)
  - [Create a Database Revision](#create-a-database-revision)
  - [Migrate the Database](#migrate-the-database)
- [Environment-specific Instructions](#environment-specific-instructions)
  - [Development Environment](#development-environment)
  - [Production Environment](#production-environment)
- [Creating the Migrations Directory](#creating-the-migrations-directory)
- [Additional Resources](#additional-resources)

---

## Create or Update tables

Step 1. Create or update SQLAlchemy tables in the `db/tables` directory.
Step 2. Import the table class in `db/tables/__init__.py` file.

## Running Migrations

### Create a Database Revision

After you have added or updated your table, create a new database revision using:

```bash
alembic -c db/alembic.ini revision --autogenerate -m "Your Revision Message"
```

> **Note:** Replace `"Your Revision Message"` with a meaningful description of the changes.

### Migrate the Database by applying the revision

Run the migration to update the database schema:

```bash
alembic -c db/alembic.ini upgrade head
```

## Environment-specific Instructions

Let's explore the migration process for both development and production environments.

### Development Environment

**Create Revision and Migrate:**

```bash
docker exec -it agent-infra-aws alembic -c db/alembic.ini revision --autogenerate -m "Your Revision Message"

docker exec -it agent-infra-aws alembic -c db/alembic.ini upgrade head
```

### Production Environment

#### Option 1: Automatic Migration at Startup

Set the environment variable `MIGRATE_DB=True` to run migrations automatically when the container starts. This executes:

```bash
alembic -c db/alembic.ini upgrade head
```

#### Option 2: Manual Migration via SSH

SSH into the production container and run the migration manually:

1. SSH into the production container

```bash
# export AWS_REGION=us-east-1

ECS_CLUSTER=agent-infra-aws-prd-cluster
SERVICE_NAME=agent-infra-aws-prd-api-service

TASK_ARN=$(aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $SERVICE_NAME --query "taskArns[0]" --output text)
TASK_DEF=$(aws ecs describe-tasks --cluster $ECS_CLUSTER --tasks $TASK_ARN --query "tasks[0].taskDefinitionArn" --output text)
CONTAINER_NAME=$(aws ecs describe-task-definition --task-definition $TASK_DEF --query "taskDefinition.containerDefinitions[0].name" --output text)

echo "TASK_ARN: $TASK_ARN"
echo "TASK_DEF: $TASK_DEF"
echo "CONTAINER_NAME: $CONTAINER_NAME"

aws ecs execute-command --cluster $ECS_CLUSTER \
    --task $TASK_ARN \
    --container $CONTAINER_NAME \
    --interactive \
    --command "zsh"
```

2. Run Migration:

```bash
alembic -c db/alembic.ini upgrade head
```

Note:

- To SSH into an ECS task, you need to install the [Session Manager plugin for the AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
- You can read more in this [blog post](https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/)
