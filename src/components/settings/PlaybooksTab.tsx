import React from "react";
import { PlaybooksEditor } from "./PlaybooksEditor";
import { Section } from "./settings-ui";

interface PlaybooksTabProps {
  onPlaybooksChanged?: () => void;
}

export function PlaybooksTab({ onPlaybooksChanged }: PlaybooksTabProps) {
  return (
    <div>
      <Section
        title="Investigation playbooks"
        description="Saved prompts and skill sets investigators can load from the Playbooks menu under the message box."
      >
        <PlaybooksEditor onPlaybooksChanged={onPlaybooksChanged} />
      </Section>
    </div>
  );
}
