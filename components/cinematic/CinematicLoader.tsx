"use client";

import { motion } from "framer-motion";

/**
 * Premium black-screen loader: a minimal SEOULSKY mark, a slow breathing
 * atmospheric glow and a single line of Korean — no spinner, never an
 * uninitialized canvas. The page cross-fades it out into the opening shot.
 */
export default function CinematicLoader({ message }: { message?: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    >
      <motion.div
        className="pointer-events-none absolute h-[60vh] w-[60vh] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(78,96,140,0.22), rgba(20,26,44,0.05) 55%, transparent 72%)",
        }}
        animate={{ opacity: [0.4, 0.85, 0.4], scale: [0.92, 1.06, 0.92] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.p
        className="relative text-[12px] font-semibold text-slate-200"
        initial={{ opacity: 0, letterSpacing: "0.2em" }}
        animate={{ opacity: 1, letterSpacing: "0.62em" }}
        transition={{ duration: 2, ease: "easeOut" }}
      >
        SEOULSKY
      </motion.p>
      <motion.div
        className="relative mt-5 h-px w-28 origin-center"
        style={{ background: "linear-gradient(90deg, transparent, rgba(148,163,184,0.7), transparent)" }}
        animate={{ scaleX: [0.3, 1, 0.3], opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.p
        className="relative mt-5 text-[11px] tracking-[0.3em] text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 0.6 }}
      >
        {message ?? "서울의 하늘을 불러오는 중"}
      </motion.p>
    </motion.div>
  );
}
