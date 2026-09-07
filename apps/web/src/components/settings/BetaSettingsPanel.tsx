import { useUpdateClientSettings, useVoidSidebarEnabled } from "../../hooks/useSettings";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function BetaSettingsPanel() {
  const voidSidebarEnabled = useVoidSidebarEnabled();
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Beta features">
        <SettingsRow
          {...searchableSetting("void-sidebar")}
          description="Void's own sidebar, with workspace rows, chat tabs, pinned projects, and recoverable archived workspaces. Turn it off to use upstream's flat thread list instead. You can switch back any time."
          control={
            <Switch
              checked={voidSidebarEnabled}
              onCheckedChange={(checked) => updateSettings({ voidSidebarEnabled: Boolean(checked) })}
              aria-label="Use the Void sidebar"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
