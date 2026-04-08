import { NextResponse } from "next/server";
import { createProjectSchema } from "@/lib/validation/schemas";
import { createProject, listProjects } from "@/features/projects/project-service";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid project payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const project = await createProject(parsed.data);
  return NextResponse.json({ project }, { status: 201 });
}
