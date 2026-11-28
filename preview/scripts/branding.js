"use strict";

const gameBrand = (() => {
  const input = window.ChhadLeagueConfig || {};
  const text = (value, fallback, limit) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
  const length = Number(input.matchSeconds);
  const settings = {
    title: text(input.title, "Chhad League", 36),
    courtLabel: text(input.courtLabel, "Old Dhaka rooftops", 48),
    matchSeconds: Number.isInteger(length) && length >= 30 && length <= 300 ? length : 90
  };
  document.title = settings.title + " · Rooftop Soccer";
  document.querySelector('meta[name="application-name"]').content = settings.title;
  document.getElementById("heading").textContent = settings.title;
  document.getElementById("card-stage").textContent = settings.courtLabel;
  if (/^#[0-9a-f]{6}$/i.test(input.accentColor)) {
    document.documentElement.style.setProperty("--gold", input.accentColor);
  }
  function setOptionalImage(id, src) {
    const image = document.getElementById(id);
    if (typeof src !== "string" || !src.trim()) return;
    image.onload = () => {
      image.hidden = false;
    };
    image.onerror = () => {
      image.hidden = true;
    };
    image.src = src;
  }
  setOptionalImage("brand-mark", input.menuLogo);
  setOptionalImage("menu-backdrop", input.menuBackdrop);
  return Object.freeze(settings);
})();
