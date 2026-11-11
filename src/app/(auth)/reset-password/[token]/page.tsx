import type { Metadata } from "next";
import { ResetForm } from "../../forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="mb-6 type-title">Choose a new password</h1>
      <ResetForm token={token} />
    </>
  );
}
