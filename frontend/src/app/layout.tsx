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
          © 2025 Tomoaki Imai{" "}
          <a
            href="https://github.com/tomoima525"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            https://github.com/tomoima525
          </a>
        </footer>
      </body>
    </html>
  );
}
