export type VizType = "line" | "area" | "bar" | "column" | "pie" | "singlevalue" | "table";

export interface SplunkDataSources {
  primary: {
    data: {
      fields: Array<{ name: string }>;
      columns: unknown[][];
    };
  };
}

export interface ChartBlock {
  type: "chart";
  vizType: VizType;
  dataSources: SplunkDataSources;
  width: number;
  height: number;
  spl?: string;
  earliest?: string;
  latest?: string;
}

export interface TextBlock {
  type: "text";
  content: string;
}

export interface SkillBlock {
  type: "skill";
  skill: string;
}

export interface LimitBlock {
  type: "limit";
  reason: "max_turns" | "stream_timeout";
  message: string;
  setting: string;
}

export type MessageBlock = TextBlock | ChartBlock | SkillBlock | LimitBlock;

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: MessageBlock[];
  isStreaming?: boolean;
}
