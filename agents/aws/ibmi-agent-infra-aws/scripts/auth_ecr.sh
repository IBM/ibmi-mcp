#!/bin/bash

set -e

# Authenticate with ecr
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 386435111151.dkr.ecr.us-east-1.amazonaws.com
