import List from "@/components/list";

const ListPage = async ({ params }: { params: { listId: string } }) => {
  const { listId } = params;
  return (
    <div>
      <h1>List Page</h1>
      {listId && <List listId={Number(listId)} />}
    </div>
  );
};

export default ListPage;
