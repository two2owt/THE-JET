/// <reference types="npm:@types/react@18.3.1" />
import * as React from "npm:react@18.3.1";

export interface TemplateEntry {
  component: React.ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  to?: string;
  displayName?: string;
  previewData?: Record<string, any>;
}

import { template as welcome } from "./welcome.tsx";
import { template as favoriteUpdate } from "./favorite-update.tsx";
import { template as friendRequest } from "./friend-request.tsx";
import { template as friendAccepted } from "./friend-accepted.tsx";
import { template as newMessage } from "./new-message.tsx";
import { template as finishOnboarding } from "./finish-onboarding.tsx";

export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: welcome,
  "favorite-update": favoriteUpdate,
  "friend-request": friendRequest,
  "friend-accepted": friendAccepted,
  "new-message": newMessage,
  "finish-onboarding": finishOnboarding,
};
