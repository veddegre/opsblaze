import React, { useState, useCallback, useMemo } from "react";
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
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "account" | "preferences" | "admin-system" | "admin-mcp" | "admin-skills"
  >("account");
  const [extractorOpen, setExtractorOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [allowAdditional, setAllowAdditional] = useState(true);

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
    setAllowAdditional(true);
  }, [startNewConversation]);

  const handleLoadConversation = useCallback(
    (id: string) => {
      clearNotice();
      loadExistingConversation(id);
      setSelectedSkills([]);
      setAllowAdditional(true);
    },
    [loadExistingConversation, clearNotice]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setSelectedSkills([]);
      setAllowAdditional(true);
    },
    [deleteConversation]
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
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        selectedSkills={selectedSkills}
        onSelectedSkillsChange={setSelectedSkills}
        allowAdditional={allowAdditional}
        onAllowAdditionalChange={setAllowAdditional}
        queryUsage={queryUsage}
        contextUsage={contextUsage}
      />
    </div>
  );
}
