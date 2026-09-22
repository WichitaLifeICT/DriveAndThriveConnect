export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-teal-700">Drive & Thrive Connect</h1>
          <p className="text-sm text-gray-500 mt-1">
            Community ride coordination
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
