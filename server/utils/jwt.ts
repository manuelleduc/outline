import { subMinutes } from "date-fns";
import invariant from "invariant";
import JWT from "jsonwebtoken";
import env from "@server/env";
import { Attachment, Team, User } from "@server/models";
import { AuthenticationError } from "../errors";

function getJWTPayload(token: string) {
  let payload;

  try {
    payload = JWT.decode(token);

    if (!payload) {
      throw AuthenticationError("Invalid token");
    }

    return payload as JWT.JwtPayload;
  } catch (err) {
    throw AuthenticationError("Unable to decode JWT token");
  }
}

export async function getUserForJWT(
  token: string,
  allowedTypes = ["session", "transfer"]
): Promise<User> {
  const payload = getJWTPayload(token);

  if (!allowedTypes.includes(payload.type)) {
    throw AuthenticationError("Invalid token");
  }

  // check the token is within it's expiration time
  if (payload.expiresAt) {
    if (new Date(payload.expiresAt) < new Date()) {
      throw AuthenticationError("Expired token");
    }
  }

  const user = await User.findByPk(payload.id, {
    include: [
      {
        model: Team,
        as: "team",
        required: true,
      },
    ],
  });
  if (!user) {
    throw AuthenticationError("Invalid token");
  }

  if (payload.type === "transfer") {
    // If the user has made a single API request since the transfer token was
    // created then it's no longer valid, they'll need to sign in again.
    if (
      user.lastActiveAt &&
      payload.createdAt &&
      user.lastActiveAt > new Date(payload.createdAt)
    ) {
      throw AuthenticationError("Token has already been used");
    }
  }

  try {
    JWT.verify(token, user.jwtSecret);
  } catch (err) {
    throw AuthenticationError("Invalid token");
  }

  return user;
}

export async function getUserForEmailSigninToken(token: string): Promise<User> {
  const payload = getJWTPayload(token);

  if (payload.type !== "email-signin") {
    throw AuthenticationError("Invalid token");
  }

  // check the token is within it's expiration time
  if (payload.createdAt) {
    if (new Date(payload.createdAt) < subMinutes(new Date(), 10)) {
      throw AuthenticationError("Expired token");
    }
  }

  const user = await User.scope("withTeam").findByPk(payload.id);
  invariant(user, "User not found");

  try {
    JWT.verify(token, user.jwtSecret);
  } catch (err) {
    throw AuthenticationError("Invalid token");
  }

  return user;
}

export async function getAttachmentForJWT(token: string): Promise<Attachment> {
  const payload = getJWTPayload(token);

  if (payload.type !== "attachment") {
    throw AuthenticationError("Invalid token");
  }

  // check the token is within it's expiration time
  if (payload.expiresAt) {
    if (new Date(payload.expiresAt) < new Date()) {
      throw AuthenticationError("Expired token");
    }
  }

  const attachmentId = payload.key.split("/")[2];
  const attachment = await Attachment.findByPk(attachmentId);
  invariant(attachment, "File not found");

  try {
    JWT.verify(token, env.FILE_STORAGE_LOCAL_SECRET);
  } catch (err) {
    throw AuthenticationError("Invalid token");
  }

  return attachment;
}
