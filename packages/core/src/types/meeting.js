"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingStateSchema = exports.MeetingIdSchema = void 0;
const zod_1 = require("zod");
exports.MeetingIdSchema = zod_1.z.string().min(8).max(64);
exports.MeetingStateSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({ type: zod_1.z.literal('idle') }),
    zod_1.z.object({ type: zod_1.z.literal('connecting'), meetingId: exports.MeetingIdSchema }),
    zod_1.z.object({
        type: zod_1.z.literal('connected'),
        meetingId: exports.MeetingIdSchema,
        peers: zod_1.z.array(zod_1.z.string()),
        encryptionState: zod_1.z.enum(['initializing', 'ready', 'error'])
    }),
    zod_1.z.object({ type: zod_1.z.literal('error'), error: zod_1.z.string() }),
]);
//# sourceMappingURL=meeting.js.map