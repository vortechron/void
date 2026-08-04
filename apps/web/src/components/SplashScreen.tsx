export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex size-24 items-center justify-center" aria-label="Void splash screen">
        <img alt="Void" className="size-16 object-contain" src="/void-mark.svg" />
      </div>
    </div>
  );
}
