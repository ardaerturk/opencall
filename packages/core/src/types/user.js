"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoleSchema = exports.UserIdSchema = void 0;
const zod_1 = require("zod");
exports.UserIdSchema = zod_1.z.string().min(16).max(64);
exports.UserRoleSchema = zod_1.z.enum(['guest', 'member', 'premium', 'enterprise']);
//# sourceMappingURL=user.js.map