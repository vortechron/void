import { useSidebarV2Enabled, useUpdateClientSettings } from "../../hooks/useSettings";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function BetaSettingsPanel() {
  const sidebarV2Enabled = useSidebarV2Enabled();
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Beta features">
        <SettingsRow
          {...searchableSetting("sidebar-v2")}
          description="Try upstream's flat thread list with active cards and compact settled rows. Void's custom workspace sidebar remains the default, and you can switch back any time."
          control={
            <Switch
              checked={sidebarV2Enabled}
              onCheckedChange={(checked) => updateSettings({ sidebarV2Enabled: Boolean(checked) })}
              aria-label="Enable the sidebar v2 beta"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
