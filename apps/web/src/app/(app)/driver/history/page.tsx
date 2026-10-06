import type { Metadata } from "next";
import { JobHistory } from "../../_components/job-history";

export const metadata: Metadata = { title: "Past jobs" };

export default function HistoryPage() {
  return <JobHistory />;
}
