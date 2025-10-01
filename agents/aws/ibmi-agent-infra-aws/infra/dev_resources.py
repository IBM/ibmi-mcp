from os import getenv

from agno.docker.app.fastapi import FastApi
from agno.docker.app.postgres import PgVectorDb
from agno.docker.resource.image import DockerImage
from agno.docker.resources import DockerResources

from infra.settings import infra_settings

#
# -*- Resources for the Development Environment
#

# -*- Dev image
dev_image = DockerImage(
    name=f"{infra_settings.image_repo}/{infra_settings.image_name}",
    tag=infra_settings.dev_env,
    enabled=infra_settings.build_images,
    path=str(infra_settings.infra_root),
    # Do not push images after building
    push_image=infra_settings.push_images,
)

# -*- Dev database running on port 5432:5432
dev_db = PgVectorDb(
    name=f"{infra_settings.infra_name}-db",
    pg_user="ai",
    pg_password="ai",
    pg_database="ai",
    # Connect to this db on port 5432
    host_port=5432,
)

# -*- Container environment
container_env = {
    "RUNTIME_ENV": "dev",
    # Get the OpenAI API key and Exa API key from the local environment
    "OPENAI_API_KEY": getenv("OPENAI_API_KEY"),
    # Database configuration
    "DB_HOST": dev_db.get_db_host(),
    "DB_PORT": dev_db.get_db_port(),
    "DB_USER": dev_db.get_db_user(),
    "DB_PASS": dev_db.get_db_password(),
    "DB_DATABASE": dev_db.get_db_database(),
    # Wait for database to be available before starting the application
    "WAIT_FOR_DB": dev_db.enabled,
    # Migrate database on startup using alembic
    "MIGRATE_DB": dev_db.enabled,
}

# -*- AgentOS running on port 8080:8080
dev_agentos = FastApi(
    name=f"{infra_settings.infra_name}-agentos",
    image=dev_image,
    command="uvicorn app.main:app --reload",
    port_number=8080,
    mount_infra_dir=True,
    env_vars=container_env,
    use_cache=True,
    # Read secrets from secrets/dev_api_secrets.yml
    secrets_file=infra_settings.infra_root.joinpath("infra/secrets/dev_api_secrets.yml"),
    depends_on=[dev_db],
)

# -*- Dev DockerResources
dev_docker_resources = DockerResources(
    infra="podman",
    env=infra_settings.dev_env,
    network=infra_settings.infra_name,
    apps=[dev_db, dev_agentos],
)
