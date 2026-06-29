import { motion } from "motion/react";

interface Props {
  /** 0x-prefixed or bare hex (any length); padded/truncated to 64 nibbles. */
  hex?: string;
  active?: boolean;
}

/**
 * The Poseidon input-commitment rendered as an 8×8 grid of hex nibbles — the
 * value's tamper-evident seal. Cells glow lime briefly when freshly sealed.
 */
export default function CommitmentGrid({ hex = "", active = false }: Props) {
  const clean = hex.replace(/^0x/, "").padStart(64, "0").slice(-64);
  const nibbles = clean.split("");
  return (
    <div className="inline-grid grid-cols-8 gap-[3px] mono select-none" aria-hidden>
      {nibbles.map((n, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={
            active
              ? { color: ["#5a6068", "#c6f24e", "#8a9099"], opacity: 1 }
              : { color: "#5a6068" }
          }
          transition={{ duration: 0.5, delay: active ? (i % 8) * 0.012 + Math.floor(i / 8) * 0.012 : 0 }}
          className="text-[10px] leading-[13px] tabular text-center"
        >
          {n}
        </motion.span>
      ))}
    </div>
  );
}
