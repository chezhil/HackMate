import { HackathonView } from "./HackathonView";

export const metadata = { title: "Hackathon · HackMate" };

// The id is read on the client (useParams) so the page shell can render instantly.
export default function HackathonPage() {
  return <HackathonView />;
}
