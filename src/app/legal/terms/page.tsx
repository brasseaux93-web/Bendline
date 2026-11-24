import { StandaloneModalFrame } from "@/components/modals/standalone-modal-frame";
import { TermsContent } from "@/components/modals/terms-content";

export default function TermsPage() {
  return (
    <StandaloneModalFrame>
      <TermsContent standalone />
    </StandaloneModalFrame>
  );
}
