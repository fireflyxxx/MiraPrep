import type { TTSPlayerHandle } from "./TTSPlayer";

export type InterviewConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface InterviewRuntimeState {
  answerText: string;
  asrFinal: boolean;
  canReplayQuestionAudio: boolean;
  connection: InterviewConnectionState;
  errorMessage: string | null;
  interviewerSpeaking: boolean;
  isEnded: boolean;
  isLoading: boolean;
  isRecording: boolean;
  isSubmitting: boolean;
  isThinking: boolean;
  voiceMode: boolean;
  voiceNotice: string | null;
  disableVoiceMode: () => void;
  enableVoiceMode: () => void;
  finishAudio: () => void;
  handleRecorderError: (message: string) => void;
  handleRecordingChange: (recording: boolean) => void;
  handleSilence: () => void;
  handleTtsSpeakingChange: (speaking: boolean) => void;
  replayQuestionAudio: () => void;
  retryConnection: () => void;
  sendAudioFrame: (frame: Uint8Array) => void;
  setAnswerText: (value: string) => void;
  setTtsPlayerHandle: (handle: TTSPlayerHandle | null) => void;
  submitAnswer: () => Promise<void>;
}
