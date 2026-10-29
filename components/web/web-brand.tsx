import Image from "next/image";

export function WebBrand() {
  return (
    <>
      <Image
        src="/icons/brand-mark.png"
        alt=""
        width={40}
        height={40}
        className="sw-brand-icon"
        priority
      />
      <span>SideSeat</span>
    </>
  );
}
