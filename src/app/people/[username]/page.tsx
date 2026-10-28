import { PersonView } from "./PersonView";

export const metadata = { title: "Profile · HackMate" };

// The username is read on the client (useParams), like the hackathon page, so the shell renders instantly.
export default function PersonPage() {
  return <PersonView />;
}
