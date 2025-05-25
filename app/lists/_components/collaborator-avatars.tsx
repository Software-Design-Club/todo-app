import React from "react";
import { User } from "@/app/lists/_actions/collaborators";
import { Avatar, AvatarFallback } from "@/ui/avatar";

interface CollaboratorAvatarsProps {
  collaborators: User[];
}

const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({
  collaborators,
}) => {
  if (collaborators.length === 0) {
    return null;
  }

  // Function to get initials from name
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Function to generate a consistent color based on the user's name
  const getAvatarColor = (name: string): string => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-yellow-500",
      "bg-red-500",
      "bg-teal-500",
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex -space-x-2">
        {collaborators.slice(0, 5).map((collaborator) => (
          <Avatar
            key={collaborator.id}
            className="w-8 h-8 border-2 border-white shadow-sm"
            title={`${collaborator.name} (${collaborator.email})`}
          >
            <AvatarFallback
              className={`${getAvatarColor(
                collaborator.name
              )} text-white text-xs font-medium`}
            >
              {getInitials(collaborator.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {collaborators.length > 5 && (
          <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
            <AvatarFallback className="bg-gray-500 text-white text-xs font-medium">
              +{collaborators.length - 5}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {collaborators.length} collaborator
        {collaborators.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
};

export default CollaboratorAvatars;
