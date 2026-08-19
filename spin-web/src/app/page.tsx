import SpinStage from "@/components/SpinStage";

export default function Home() {
  return (
    <main className="ambient relative flex flex-1 items-center">
      <div aria-hidden className="grid-texture pointer-events-none absolute inset-0" />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-16 sm:px-10">
        <SpinStage />
      </div>
    </main>
  );
}
