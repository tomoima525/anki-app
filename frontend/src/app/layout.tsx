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
      <body>{children}</body>
    </html>
  );
}
