import React, { useState, useCallback, useMemo, useEffect } from "react";
import { AuthGate } from "./components/AuthGate";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { SettingsPanel } from "./components/SettingsPanel";
import { SkillExtractor } from "./components/SkillExtractor";
import { ChatView } from "./components/ChatView";
import { InputBar } from "./components/InputBar";
import { AppNotice } from "./components/AppNotice";
import { useChat } from "./hooks/useChat";
import type { PublicAuthUser } from "./lib/auth";
import { getSettings, listSkillsApi, type SkillPack } from "./lib/settings-api";
import { listPlaybooks, type InvestigationPlaybook } from "./lib/playbooks-api";
import { activeSkillPacks } from "./lib/skill-packs-utils";

export function App() {
  return (
    <AuthGate>
      {(user) => <AppContent user={user} />}
    </AuthGate>
  );
}

function AppContent({ user }: { user: PublicAuthUser }) {
  const {
    messages,
    isStreaming,
    conversationId,
    conversationTitle,
    queryUsage,
    contextUsage,
    streamingConversationIds,
    notice,
    clearNotice,
    sendMessage,
    startNewConversation,
    loadExistingConversation,
    renameConversation,
    deleteConversation,
    stopStreaming,
    conversationSkillScope,
    persistSkillScope,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    | "account"
    | "preferences"
    | "admin-system"
    | "admin-mcp"
    | "admin-skills"
    | "admin-audit"
  >("account");
  const [extractorOpen, setExtractorOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [allowAdditional, setAllowAdditional] = useState(false);
  const [skillPacks, setSkillPacks] = useState<SkillPack[]>([]);
  const [playbooks, setPlaybooks] = useState<InvestigationPlaybook[]>([]);
  const [inputPrefill, setInputPrefill] = useState<string | null>(null);

  const refreshRuntimeConfig = useCallback(() => {
    Promise.all([getSettings(), listSkillsApi()])
      .then(([s, skills]) => {
        setSkillPacks(activeSkillPacks(s.runtime.skillPacks ?? [], skills));
      })
      .catch(() => {});
    listPlaybooks()
      .then(setPlaybooks)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshRuntimeConfig();
  }, [refreshRuntimeConfig]);

  useEffect(() => {
    if (!settingsOpen) refreshRuntimeConfig();
  }, [settingsOpen, refreshRuntimeConfig]);

  const openSettings = useCallback(
    (section: typeof settingsSection = "account") => {
      setSettingsSection(section);
      setSettingsOpen(true);
    },
    []
  );

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (open) return false;
      setSettingsSection("account");
      return true;
    });
  }, []);

  const hasSubstance =
    !!conversationId && messages.filter((m) => m.role === "assistant").length >= 1;

  const sidebarListKey = `${conversationId ?? "none"}-${messages.length}`;

  const backgroundStreamingNotice = useMemo(() => {
    const others = streamingConversationIds.filter((id) => id !== conversationId);
    if (others.length === 0) return null;
    return "Another investigation is still running — open it from the sidebar when ready.";
  }, [streamingConversationIds, conversationId]);

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    setSelectedSkills([]);
    setAllowAdditional(false);
  }, [startNewConversation]);

  const handleLoadConversation = useCallback(
    (id: string) => {
      clearNotice();
      loadExistingConversation(id);
    },
    [loadExistingConversation, clearNotice]
  );

  useEffect(() => {
    if (conversationSkillScope) {
      setSelectedSkills(conversationSkillScope.skills);
      setAllowAdditional(!conversationSkillScope.strict);
    } else if (conversationId) {
      setSelectedSkills([]);
      setAllowAdditional(false);
    }
  }, [conversationId, conversationSkillScope]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  const handleSelectedSkillsChange = useCallback(
    (skills: string[]) => {
      setSelectedSkills(skills);
      if (!conversationId) return;
      if (skills.length === 0) {
        persistSkillScope(null);
      } else {
        persistSkillScope({ skills, strict: !allowAdditional });
      }
    },
    [conversationId, allowAdditional, persistSkillScope]
  );

  const handleAllowAdditionalChange = useCallback(
    (allow: boolean) => {
      setAllowAdditional(allow);
      if (!conversationId || selectedSkills.length === 0) return;
      persistSkillScope({ skills: selectedSkills, strict: !allow });
    },
    [conversationId, selectedSkills, persistSkillScope]
  );

  const applySkillPack = useCallback(
    (pack: SkillPack) => {
      setSelectedSkills(pack.skills);
      setAllowAdditional(pack.strict === false);
      if (conversationId) {
        persistSkillScope({ skills: pack.skills, strict: pack.strict !== false });
      }
    },
    [conversationId, persistSkillScope]
  );

  const applyPlaybook = useCallback(
    (pb: InvestigationPlaybook) => {
      setSelectedSkills(pb.skills);
      setAllowAdditional(!pb.strict);
      setInputPrefill(pb.prompt);
      if (conversationId) {
        persistSkillScope({ skills: pb.skills, strict: pb.strict });
      }
    },
    [conversationId, persistSkillScope]
  );

  const sendWithSkills = useCallback(
    (message: string) => {
      clearNotice();
      if (selectedSkills.length > 0) {
        sendMessage(message, { skills: selectedSkills, strict: !allowAdditional });
      } else {
        sendMessage(message);
      }
    },
    [sendMessage, selectedSkills, allowAdditional, clearNotice]
  );

  return (
    <div className="flex flex-col h-screen bg-surface-0">
      <Header
        user={user}
        onClear={handleNewConversation}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onOpenSettings={toggleSettings}
        onOpenAccount={() => openSettings("account")}
        onOpenPreferences={() => openSettings("preferences")}
        onDistillSkill={() => setExtractorOpen(true)}
        canDistill={hasSubstance && !isStreaming}
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        activeSkillScope={conversationSkillScope}
        canExport={hasSubstance && !isStreaming}
      />
      <AppNotice
        message={notice}
        variant={notice?.includes("finished") ? "info" : "error"}
        onDismiss={clearNotice}
      />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeConversationId={conversationId}
        streamingConversationIds={streamingConversationIds}
        listRefreshKey={sidebarListKey}
        onSelect={handleLoadConversation}
        onDelete={handleDeleteConversation}
        onRename={renameConversation}
        onNew={handleNewConversation}
      />
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        initialSection={settingsSection}
        onPlaybooksChanged={refreshRuntimeConfig}
      />
      <SkillExtractor
        isOpen={extractorOpen}
        onClose={() => setExtractorOpen(false)}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
      />
      <ChatView
        messages={messages}
        isStreaming={isStreaming}
        onSend={sendWithSkills}
        backgroundStreamingNotice={backgroundStreamingNotice}
      />
      <InputBar
        onSend={sendWithSkills}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        selectedSkills={selectedSkills}
        onSelectedSkillsChange={handleSelectedSkillsChange}
        allowAdditional={allowAdditional}
        onAllowAdditionalChange={handleAllowAdditionalChange}
        skillPacks={skillPacks}
        onApplySkillPack={applySkillPack}
        playbooks={playbooks}
        onApplyPlaybook={applyPlaybook}
        prefillMessage={inputPrefill}
        onPrefillConsumed={() => setInputPrefill(null)}
        queryUsage={queryUsage}
        contextUsage={contextUsage}
      />
    </div>
  );
}
