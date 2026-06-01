import { keccak256, stringToHex, zeroHash } from "viem";
import { useReadContract } from "wagmi";
import { accessControlAbi } from "../abi/gamefi";
import { contracts } from "../config/contracts";
import { bscChain } from "../config/chains";

const operatorRole = keccak256(stringToHex("OPERATOR_ROLE"));
const pauserRole = keccak256(stringToHex("PAUSER_ROLE"));
const revenueRole = keccak256(stringToHex("REVENUE_ROLE"));
const gameAdminRole = keccak256(stringToHex("GAME_ADMIN_ROLE"));
const automationRole = keccak256(stringToHex("AUTOMATION_ROLE"));

export function useAdminAccess(address?: `0x${string}`) {
  const accessAddress = contracts.accessControl;

  const adminCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [zeroHash, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const operatorCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [operatorRole, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const pauserCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [pauserRole, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const revenueCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [revenueRole, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const gameAdminCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [gameAdminRole, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const automationCheck = useReadContract({
    address: accessAddress,
    chainId: bscChain.id,
    abi: accessControlAbi,
    functionName: "hasRole",
    args: [automationRole, address!],
    query: {
      enabled: Boolean(accessAddress && address),
    },
  });

  const isLoading =
    Boolean(accessAddress && address) &&
    (
      adminCheck.isPending
      || operatorCheck.isPending
      || pauserCheck.isPending
      || revenueCheck.isPending
      || gameAdminCheck.isPending
      || automationCheck.isPending
    );

  const hasAdminAccess =
    Boolean(adminCheck.data)
    || Boolean(operatorCheck.data)
    || Boolean(pauserCheck.data)
    || Boolean(revenueCheck.data)
    || Boolean(gameAdminCheck.data)
    || Boolean(automationCheck.data);

  return {
    hasAdminAccess,
    isLoading,
  };
}
