import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { authorizeFileUrl, serializeParams } from "./client.js";
import { buildLaunchUrl, decodeLaunchToken } from "./login.js";

test("serializeParams utilise la notation tableau de PHP", () => {
  assert.deepEqual(serializeParams({ courseid: 42 }), [["courseid", "42"]]);
  assert.deepEqual(serializeParams({ courseids: [4, 7] }), [
    ["courseids[0]", "4"],
    ["courseids[1]", "7"],
  ]);
  // Les options Moodle sont des tableaux d'objets {name, value}.
  assert.deepEqual(serializeParams({ options: [{ name: "excludecontents", value: 1 }] }), [
    ["options[0][name]", "excludecontents"],
    ["options[0][value]", "1"],
  ]);
  assert.deepEqual(serializeParams({ flag: true, off: false }), [
    ["flag", "1"],
    ["off", "0"],
  ]);
  assert.deepEqual(serializeParams({ skip: undefined, keep: 1 }), [["keep", "1"]]);
});

test("authorizeFileUrl bascule sur le point d'entrée web service et ajoute le jeton", () => {
  const url = new URL(authorizeFileUrl("https://keats.kcl.ac.uk/pluginfile.php/123/mod_resource/content/1/w1.pdf", "TK"));
  assert.equal(url.pathname, "/webservice/pluginfile.php/123/mod_resource/content/1/w1.pdf");
  assert.equal(url.searchParams.get("token"), "TK");
  assert.equal(url.searchParams.get("forcedownload"), "1");
});

test("authorizeFileUrl n'altère pas une URL déjà en mode web service", () => {
  const url = new URL(authorizeFileUrl("https://keats.kcl.ac.uk/webservice/pluginfile.php/9/x.pptx?a=b", "TK"));
  assert.equal(url.pathname, "/webservice/pluginfile.php/9/x.pptx");
  assert.equal(url.searchParams.get("a"), "b");
  assert.equal(url.searchParams.get("token"), "TK");
});

test("buildLaunchUrl demande le service mobile et le schéma d'URL", () => {
  const url = new URL(buildLaunchUrl("https://keats.kcl.ac.uk", "12.345"));
  assert.equal(url.pathname, "/admin/tool/mobile/launch.php");
  assert.equal(url.searchParams.get("service"), "moodle_mobile_app");
  assert.equal(url.searchParams.get("passport"), "12.345");
  assert.equal(url.searchParams.get("urlscheme"), "moodlemobile");
});

test("decodeLaunchToken vérifie la signature du passport", () => {
  const site = "https://keats.kcl.ac.uk";
  const passport = "12.345";
  const signature = crypto.createHash("md5").update(`${site}${passport}`).digest("hex");
  const payload = Buffer.from(`${signature}:::abc123:::priv456`).toString("base64");

  const decoded = decodeLaunchToken(`moodlemobile://token=${payload}`, site, passport);
  assert.deepEqual(decoded, { token: "abc123", privateToken: "priv456" });

  // Sans passport, on décode quand même (mode « j'ai perdu le passport »).
  assert.equal(decodeLaunchToken(`moodlemobile://token=${payload}`, site).token, "abc123");
  // Avec un mauvais passport, on refuse.
  assert.throws(() => decodeLaunchToken(`moodlemobile://token=${payload}`, site, "99.9"), /Signature invalide/);
});

test("decodeLaunchToken rejette ce qui n'est pas un retour de connexion", () => {
  assert.throws(() => decodeLaunchToken("https://keats.kcl.ac.uk/my/", "s"), /moodlemobile:\/\/token=/);
  const bad = Buffer.from("pasdeseparateur").toString("base64");
  assert.throws(() => decodeLaunchToken(`moodlemobile://token=${bad}`, "s"), /illisible/);
});
