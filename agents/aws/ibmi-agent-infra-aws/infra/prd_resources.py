from os import getenv

from agno.aws.app.fastapi import FastApi
from agno.aws.resource.ec2 import InboundRule, SecurityGroup
from agno.aws.resource.ecs import EcsCluster
from agno.aws.resource.rds import DbInstance, DbSubnetGroup
from agno.aws.resource.reference import AwsReference
from agno.aws.resource.s3 import S3Bucket
from agno.aws.resource.secret import SecretsManager
from agno.aws.resources import AwsResources
from agno.docker.resource.image import DockerImage
from agno.docker.resources import DockerResources

from infra.settings import infra_settings

#
# -*- Resources for the Production Environment
#
# Skip resource deletion when running `ag infra down` (set to True after initial deployment)
skip_delete: bool = False
# Save resource outputs to infra/outputs
save_output: bool = True

# -*- Production image
prd_image = DockerImage(
    name=f"{infra_settings.image_repo}/{infra_settings.image_name}",
    tag=infra_settings.prd_env,
    enabled=infra_settings.build_images,
    path=str(infra_settings.infra_root),
    platforms=["linux/amd64", "linux/arm64"],
    # Push images after building
    push_image=infra_settings.push_images,
)

# -*- S3 bucket for production data (set enabled=True when needed)
prd_bucket = S3Bucket(
    name=f"{infra_settings.prd_key}-storage",
    enabled=False,
    acl="private",
    skip_delete=skip_delete,
    save_output=save_output,
)

# -*- Secrets for production application
prd_secret = SecretsManager(
    name=f"{infra_settings.prd_key}-secrets",
    group="app",
    # Create secret from infra/secrets/prd_api_secrets.yml
    secret_files=[infra_settings.infra_root.joinpath("infra/secrets/prd_api_secrets.yml")],
    skip_delete=skip_delete,
    save_output=save_output,
)
# -*- Secrets for production database
prd_db_secret = SecretsManager(
    name=f"{infra_settings.prd_key}-db-secrets",
    group="db",
    # Create secret from infra/secrets/prd_db_secrets.yml
    secret_files=[infra_settings.infra_root.joinpath("infra/secrets/prd_db_secrets.yml")],
    skip_delete=skip_delete,
    save_output=save_output,
)

# -*- Security Group for the load balancer
prd_lb_sg = SecurityGroup(
    name=f"{infra_settings.prd_key}-lb-sg",
    group="app",
    description="Security group for the load balancer",
    inbound_rules=[
        InboundRule(
            description="Allow HTTP traffic from the internet",
            port=80,
            cidr_ip="0.0.0.0/0",
        ),
        InboundRule(
            description="Allow HTTPS traffic from the internet",
            port=443,
            cidr_ip="0.0.0.0/0",
        ),
    ],
    subnets=infra_settings.aws_subnet_ids,
    skip_delete=skip_delete,
    save_output=save_output,
)
# -*- Security Group for the application
prd_sg = SecurityGroup(
    name=f"{infra_settings.prd_key}-sg",
    group="app",
    description="Security group for the production application",
    inbound_rules=[
        InboundRule(
            description="Allow traffic from LB to the FastAPI server",
            port=8000,
            security_group_id=AwsReference(prd_lb_sg.get_security_group_id),
        ),
    ],
    depends_on=[prd_lb_sg],
    subnets=infra_settings.aws_subnet_ids,
    skip_delete=skip_delete,
    save_output=save_output,
)
# -*- Security Group for the database
prd_db_port = 5432
prd_db_sg = SecurityGroup(
    name=f"{infra_settings.prd_key}-db-sg",
    group="db",
    description="Security group for the production database",
    inbound_rules=[
        InboundRule(
            description="Allow traffic from apps to the database",
            port=prd_db_port,
            security_group_id=AwsReference(prd_sg.get_security_group_id),
        ),
    ],
    depends_on=[prd_sg],
    subnets=infra_settings.aws_subnet_ids,
    skip_delete=skip_delete,
    save_output=save_output,
)

# -*- RDS Database Subnet Group
prd_db_subnet_group = DbSubnetGroup(
    name=f"{infra_settings.prd_key}-db-sg",
    group="db",
    subnet_ids=infra_settings.aws_subnet_ids,
    skip_delete=skip_delete,
    save_output=save_output,
)

# # -*- RDS Database Instance
prd_db = DbInstance(
    name=f"{infra_settings.prd_key}-db",
    group="db",
    db_name="ai",
    port=prd_db_port,
    engine="postgres",
    engine_version="17.2",
    allocated_storage=64,
    # NOTE: For production, use a larger instance type.
    # Last checked price: ~$25 per month
    db_instance_class="db.t4g.small",
    db_security_groups=[prd_db_sg],
    db_subnet_group=prd_db_subnet_group,
    availability_zone=infra_settings.aws_az1,
    publicly_accessible=True,
    enable_performance_insights=True,
    aws_secret=prd_db_secret,
    skip_delete=skip_delete,
    save_output=save_output,
    # Do not wait for the db to be deleted
    wait_for_delete=False,
)

# -*- ECS cluster
prd_ecs_cluster = EcsCluster(
    name=f"{infra_settings.prd_key}-cluster",
    ecs_cluster_name=infra_settings.prd_key,
    capacity_providers=["FARGATE"],
    skip_delete=skip_delete,
    save_output=save_output,
)

# -*- Build container environment
container_env = {
    "RUNTIME_ENV": "prd",
    # Get the OpenAI API key from the local environment
    "OPENAI_API_KEY": getenv("OPENAI_API_KEY"),
    # Database configuration
    "DB_HOST": AwsReference(prd_db.get_db_endpoint),
    "DB_PORT": AwsReference(prd_db.get_db_port),
    "DB_USER": AwsReference(prd_db.get_master_username),
    "DB_PASS": AwsReference(prd_db.get_master_user_password),
    "DB_DATABASE": AwsReference(prd_db.get_db_name),
    # Wait for database to be available before starting the application
    "WAIT_FOR_DB": prd_db.enabled,
    # Migrate database on startup using alembic
    "MIGRATE_DB": prd_db.enabled,
}

# -*- FastApi running on ECS
prd_fastapi = FastApi(
    name=f"{infra_settings.prd_key}-api",
    group="api",
    image=prd_image,
    command="uvicorn app.main:app --workers 2",
    port_number=8000,
    ecs_task_cpu="1024",
    ecs_task_memory="2048",
    ecs_service_count=1,
    ecs_cluster=prd_ecs_cluster,
    aws_secrets=[prd_secret],
    subnets=infra_settings.aws_subnet_ids,
    security_groups=[prd_sg],
    # To enable HTTPS, create an ACM certificate and add the ARN below:
    # load_balancer_enable_https=True,
    # load_balancer_certificate_arn="LOAD_BALANCER_CERTIFICATE_ARN",
    load_balancer_security_groups=[prd_lb_sg],
    create_load_balancer=True,
    health_check_path="/v1/health",
    env_vars=container_env,
    skip_delete=skip_delete,
    save_output=save_output,
    # Do not wait for the service to stabilize
    wait_for_create=False,
    # Do not wait for the service to be deleted
    wait_for_delete=False,
)

# -*- Production DockerResources
prd_docker_resources = DockerResources(
    env=infra_settings.prd_env,
    network=infra_settings.infra_name,
    resources=[prd_image],
)

# -*- Production AwsResources
prd_aws_config = AwsResources(
    env=infra_settings.prd_env,
    apps=[prd_fastapi],
    resources=(
        prd_lb_sg,
        prd_sg,
        prd_db_sg,
        prd_secret,
        prd_db_secret,
        prd_db_subnet_group,
        prd_db,
        prd_ecs_cluster,
        prd_bucket,
    ),
)
