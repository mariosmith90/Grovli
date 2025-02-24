import os
import requests
from functools import wraps
from flask import request, jsonify
from jose import jwt
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE")
ALGORITHMS = ["RS256"]

def get_auth0_public_keys():
    """Fetch Auth0 JSON Web Key Set (JWKS) to verify JWT signatures."""
    url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    response = requests.get(url)

    if response.status_code != 200:
        raise Exception("Could not retrieve JWKS from Auth0")

    return response.json()["keys"]

def verify_jwt(token):
    """Decode and verify a JWT token using Auth0 public keys."""
    keys = get_auth0_public_keys()
    unverified_header = jwt.get_unverified_header(token)

    rsa_key = {}
    for key in keys:
        if key["kid"] == unverified_header["kid"]:
            rsa_key = {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key["use"],
                "n": key["n"],
                "e": key["e"]
            }
    
    if not rsa_key:
        raise Exception("Public key not found.")

    try:
        payload = jwt.decode(
            token, 
            rsa_key, 
            algorithms=ALGORITHMS, 
            audience=AUTH0_AUDIENCE, 
            issuer=f"https://{AUTH0_DOMAIN}/"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception("Token is expired")
    except jwt.JWTClaimsError:
        raise Exception("Incorrect claims, please check audience and issuer.")
    except Exception as e:
        raise Exception(f"Token validation error: {e}")

def requires_auth(f):
    """Decorator to require authentication on API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", None)

        if not auth:
            return jsonify({"message": "Missing authorization header"}), 401

        parts = auth.split()
        if parts[0].lower() != "bearer" or len(parts) != 2:
            return jsonify({"message": "Invalid token header"}), 401

        token = parts[1]
        try:
            payload = verify_jwt(token)
        except Exception as e:
            return jsonify({"message": str(e)}), 401

        return f(payload, *args, **kwargs)
    return decorated