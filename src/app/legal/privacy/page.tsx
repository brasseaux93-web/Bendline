import { PrivacyContent } from "@/components/modals/privacy-content";
import { StandaloneModalFrame } from "@/components/modals/standalone-modal-frame";

export default function PrivacyPage() {
  return (
    <StandaloneModalFrame>
      <PrivacyContent standalone />
    </StandaloneModalFrame>
  );
}
