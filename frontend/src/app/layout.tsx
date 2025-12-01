import "./globals.css";

export const metadata = {
  title: "Anki Interview App",
  description: "Spaced repetition for interview questions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-gray-50 py-3 text-center text-xs text-gray-600">
          <div className="flex flex-col items-center gap-2">
            <div>
              © 2025 Tomoaki Imai{" "}
              <a
                href="https://github.com/tomoima525"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                https://github.com/tomoima525
              </a>
            </div>
            <a
              href="https://github.com/tomoima525/anki-app"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 200 30"
                className="h-5"
              >
                <text
                  x="15"
                  y="20"
                  fill="#6B7280"
                  fontSize="14"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  ⚡ Open Source
                </text>
              </svg>
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
