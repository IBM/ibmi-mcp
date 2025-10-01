from pathlib import Path

from agno.infra.settings import InfraSettings

#
# We define infra settings using a InfraSettings object
# these values can also be set using environment variables
# Import them into your project using `from infra.settings import infra_settings`
#
infra_settings = InfraSettings(
    # Infrastructure name
    infra_name="agent-os-template",
    # Path to the infra root
    infra_root=Path(__file__).parent.parent.resolve(),
    # -*- Infra Environments
    dev_env="dev",
    prd_env="prd",
    # default env for `agno infra` commands
    default_env="dev",
    # -*- Image Settings
    # Repository for images
    # image_repo="agnohq",
    # 'Name:tag' for the image
    image_name="agent-os-template",
    # Build images locally
    build_images=True,
    # Push images after building
    # push_images=True,
    # Skip cache when building images
    skip_image_cache=False,
    # Force pull images
    force_pull_images=False,
    # -*- AWS settings
    # Region for AWS resources
    aws_region="us-east-1",
    # Availability Zones for AWS resources
    aws_az1="us-east-1a",
    aws_az2="us-east-1b",
    # Subnets for AWS resources
    # aws_subnet_ids=["subnet-xyz", "subnet-xyz"],
    # Security Groups for AWS resources
    # aws_security_group_ids=["sg-xyz", "sg-xyz"],
)
