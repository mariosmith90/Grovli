import json
import os
import stripe
import requests
from flask import Flask, jsonify, request
from auth import requires_auth

# ✅ Load environment variables
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_ENDPOINT_SECRET")
auth0_domain = os.getenv("AUTH0_DOMAIN")
auth0_client_id = os.getenv("AUTH0_CLIENT_ID")
auth0_client_secret = os.getenv("AUTH0_CLIENT_SECRET")
auth0_audience = os.getenv("AUTH0_AUDIENCE")

app = Flask(__name__)

@app.route("/authorized", methods=["GET"])
@requires_auth
def secured_resource(payload):
    """Protected route that requires authentication."""
    return jsonify({
        "message": "Secured Resource",
        "user": payload
    })

# ✅ Get Auth0 management API token
def get_auth0_token():
    url = f"https://{auth0_domain}/oauth/token"
    payload = {
        "client_id": auth0_client_id,
        "client_secret": auth0_client_secret,
        "audience": auth0_audience,
        "grant_type": "client_credentials",
        "scope": "read:users update:users update:users_app_metadata"
    }
    response = requests.post(url, json=payload)
    data = response.json()

    if response.status_code != 200:
        print(f"❌ Failed to get Auth0 token: {data}")
        return None

    print(f"✅ Auth0 Token Retrieved: {data.get('access_token')[:20]}... (truncated)")
    return data.get("access_token")

# ✅ Update Auth0 user to "Pro"
def update_auth0_user(email):
    token = get_auth0_token()
    if not token:
        print("❌ Failed to get Auth0 token")
        return False

    headers = {"Authorization": f"Bearer {token}"}

    # 🔍 Find user in Auth0 by email
    search_url = f"https://{auth0_domain}/api/v2/users?q=email:{email}&search_engine=v3"
    search_response = requests.get(search_url, headers=headers)

    if search_response.status_code != 200:
        print(f"❌ Failed to fetch user from Auth0: {search_response.json()}")
        return False

    users = search_response.json()
    if not users or "error" in users:
        print(f"❌ User not found: {email}")
        return False

    auth0_user_id = users[0]["user_id"]
    print(f"✅ Found Auth0 user: {auth0_user_id}")

    # 🔄 Update user metadata to "pro"
    update_url = f"https://{auth0_domain}/api/v2/users/{auth0_user_id}"
    update_payload = {"app_metadata": {"subscription": "pro"}}

    update_response = requests.patch(update_url, headers=headers, json=update_payload)

    if update_response.status_code == 200:
        print(f"✅ Successfully updated Auth0 user {auth0_user_id} to 'pro'")
        return True
    else:
        print(f"❌ Failed to update Auth0 user: {update_response.json()}")
        return False

# ✅ Check Auth0 User Subscription
@app.route("/auth0/user-subscription", methods=["POST"])
def check_user_subscription():
    """
    Returns the user's subscription status from Auth0.
    """
    data = request.get_json()
    email = data.get("email")

    if not email:
        return jsonify({"error": "Email is required"}), 400

    token = get_auth0_token()
    if not token:
        return jsonify({"error": "Failed to get Auth0 token"}), 500

    headers = {"Authorization": f"Bearer {token}"}
    
    # 🔍 Find user in Auth0 by email
    search_url = f"https://{auth0_domain}/api/v2/users?q=email:{email}&search_engine=v3"
    response = requests.get(search_url, headers=headers)

    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch user from Auth0"}), 500

    users = response.json()
    if not users:
        return jsonify({"error": "User not found"}), 404

    auth0_user = users[0]
    subscription = auth0_user.get("app_metadata", {}).get("subscription", "free")

    return jsonify({"email": email, "subscription": subscription}), 200

# ✅ Stripe Webhook to Detect Successful Payments
@app.route("/webhook", methods=["POST"])
def webhook():
    payload = request.get_data(as_text=True)  # Ensures proper string format
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except stripe.error.SignatureVerificationError as e:
        print(f"❌ Webhook signature failed: {e}")
        print(f"Received payload: {payload}")  # Debug payload
        return jsonify(success=False, error="Invalid signature"), 400
    except Exception as e:
        print(f"❌ Error processing webhook: {e}")
        return jsonify(success=False, error="Webhook processing error"), 400

    print(f"✅ Received event: {event['type']}")  # Debug event type

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        # ✅ FIX: Only use `customer_details.email`
        email = session.get("customer_details", {}).get("email")

        if not email:
            print("❌ No email found in session data:", session)  # Debug full session data
            return jsonify(success=False, error="No email found"), 400

        print(f"💰 Payment received for {email}. Upgrading user...")
        success = update_auth0_user(email)
        return jsonify(success=success), 200

    print(f"⚠️ Unhandled event: {event['type']}")
    return jsonify(success=True), 200

if __name__ == "__main__":
    app.run(port=4242, debug=True)