"use client";

export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 w-full bg-gray-500 text-white text-center py-3 text-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center px-4">
        <div className="font-semibold">© {new Date().getFullYear()} Grovli</div>
        <div className="flex space-x-6 mt-4 md:mt-0">
          <a href="/about" className="hover:text-gray-300 transition-colors">About</a>
          <a href="https://form.typeform.com/to/r6ucQF6l" className="hover:text-gray-300 transition-colors">Contact</a>
          <a href="/terms" className="hover:text-gray-300 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</a>
        </div>
      </div>
    </footer>
  );
}
