import { redirect } from "next/navigation";

// The plane cinematic home page is retired. The entire experience now lives at
// /sky (one continuous scroll, no in-page navigation). Send the root there.
export default function RootPage() {
  redirect("/sky");
}
