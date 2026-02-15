import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">Stock Not Found</h1>
      <p className="mt-4 text-muted-foreground">
        The stock symbol you're looking for doesn't exist in our database.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}

