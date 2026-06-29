import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

interface Props {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/** Springs a number up to `value` and renders it without React re-renders. */
export default function Odometer({ value, format = (n) => n.toLocaleString(), className }: Props) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 18, mass: 0.8 });
  const text = useTransform(spring, (v) => format(Math.round(v)));
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
