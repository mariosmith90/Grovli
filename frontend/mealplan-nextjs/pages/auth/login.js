import { useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value.trim() });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { email, password } = formData;

    if (!email || !password) {
      setError("All fields are required.");
      setLoading(false);
      return;
    }

    // Retrieve stored users from localStorage
    const existingUsers = JSON.parse(localStorage.getItem("users")) || {};

    if (!existingUsers[email]) {
      setError("User not found. Please register first.");
      setLoading(false);
      return;
    }

    if (existingUsers[email].password !== password) {
      setError("Incorrect password.");
      setLoading(false);
      return;
    }

    // Save session (fake authentication token)
    localStorage.setItem("token", JSON.stringify({ email, isLoggedIn: true }));

    alert("Login successful!");
    router.push("/"); // Redirect to meal planner page
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-900">Login</h2>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 text-white rounded-lg ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="text-gray-500 text-center mt-4">
          Don't have an account?{" "}
          <span onClick={() => router.push("/register")} className="text-blue-600 cursor-pointer">
            Register here
          </span>
        </p>
      </div>
    </div>
  );
}