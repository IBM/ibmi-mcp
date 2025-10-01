"""
Verification script for watsonx configuration.

This script checks if your watsonx environment variables are set correctly
and validates that they work with the WatsonX model class.
"""

import sys
from pathlib import Path

# Add the infra directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from infra.config import config
from agents.utils.watsonx import MyWatsonx
from agents.utils import get_model


def verify_watsonx_config():
    """Verify watsonx configuration."""
    print("=" * 60)
    print("WatsonX Configuration Verification")
    print("=" * 60)
    print()

    # Check environment variables
    print("1. Environment Variables Check:")
    print(f"   WATSONX_API_KEY: {'✓ Set' if config.watsonx.api_key else '✗ Missing'}")
    if config.watsonx.api_key:
        print(f"      Value: {config.watsonx.api_key[:8]}...{config.watsonx.api_key[-4:]}")

    print(f"   WATSONX_PROJECT_ID: {'✓ Set' if config.watsonx.project_id else '✗ Missing'}")
    if config.watsonx.project_id:
        print(f"      Value: {config.watsonx.project_id}")

    print(f"   WATSONX_URL: {'✓ Set' if config.watsonx.url else '✗ Missing'}")
    if config.watsonx.url:
        print(f"      Value: {config.watsonx.url}")

    print(f"   WATSONX_MODEL_ID: {config.watsonx.model_id}")
    print(f"   WATSONX_VERIFY: {config.watsonx.verify}")
    print()

    # Check if properly configured
    print("2. Configuration Status:")
    if config.watsonx.is_configured:
        print("   ✓ WatsonX is properly configured")
    else:
        print("   ✗ WatsonX is NOT properly configured")
        print("   Missing required environment variables:")
        if not config.watsonx.api_key:
            print("      - WATSONX_API_KEY")
        if not config.watsonx.project_id and not config.watsonx.space_id:
            print("      - WATSONX_PROJECT_ID (or WATSONX_SPACE_ID)")
        print()
        print("   Please set these in infra/.env file")
        return False
    print()

    # Show model kwargs
    print("3. Model Initialization Parameters:")
    kwargs = config.watsonx.to_model_kwargs()
    for key, value in kwargs.items():
        if key == "api_key":
            print(f"   {key}: {value[:8]}...{value[-4:]}")
        else:
            print(f"   {key}: {value}")
    print()

    # Test model creation via get_model
    print("4. Testing Model Creation:")
    try:
        print("   Creating model via get_model('watsonx:llama-3-3-70b-instruct')...")
        model = get_model("watsonx:llama-3-3-70b-instruct")
        print(f"   ✓ Model created successfully")
        print(f"      Type: {type(model).__name__}")
        print(f"      Model ID: {model.id}")
        print(f"      API Key: {model.api_key[:8] if model.api_key else 'None'}...{model.api_key[-4:] if model.api_key else ''}")
        print(f"      Project ID: {model.project_id if hasattr(model, 'project_id') else 'N/A'}")
        print(f"      URL: {model.url if hasattr(model, 'url') else 'N/A'}")
    except Exception as e:
        print(f"   ✗ Failed to create model: {e}")
        return False
    print()

    # Test direct MyWatsonx instantiation
    print("5. Testing Direct MyWatsonx Creation:")
    try:
        print("   Creating MyWatsonx directly with config kwargs...")
        direct_model = MyWatsonx(id="llama-3-3-70b-instruct", **kwargs)
        print(f"   ✓ Direct model created successfully")
        print(f"      Type: {type(direct_model).__name__}")
        print(f"      Model ID: {direct_model.id}")
    except Exception as e:
        print(f"   ✗ Failed to create direct model: {e}")
        return False
    print()

    # Compare parameter mappings
    print("6. WatsonX Base Class Parameter Mapping:")
    print("   Expected parameters from WatsonX base class:")
    print("      - api_key: Required (from WATSONX_API_KEY)")
    print("      - project_id: Required (from WATSONX_PROJECT_ID)")
    print("      - url: Optional (from WATSONX_URL or WATSONX_BASE_URL)")
    print("      - verify: Optional (from WATSONX_VERIFY, default: True)")
    print()
    print("   Your config provides:")
    for key in kwargs.keys():
        print(f"      ✓ {key}")
    print()

    print("=" * 60)
    print("✓ All checks passed! Your watsonx configuration is valid.")
    print("=" * 60)
    return True


if __name__ == "__main__":
    try:
        success = verify_watsonx_config()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ Verification failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
