import { useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    const existingUsers = JSON.parse(localStorage.getItem("users")) || {};

    const user = existingUsers[formData.email];
    if (!user || user.password !== formData.password) {
      setError("User not found or incorrect password.");
      return;
    }

    localStorage.setItem("token", JSON.stringify({ email: formData.email }));
    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      {/* Grovli Logo - Centered Above Form */}
      <div 
        className="text-gray-900 text-5xl font-bold mb-8 cursor-pointer"
        onClick={() => router.push('/home')}
      >
        Grovli
      </div>

      {/* Login Form */}
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
            className="w-full py-2 px-4 text-white rounded-lg bg-blue-600 hover:bg-blue-700"
          >
            Login
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