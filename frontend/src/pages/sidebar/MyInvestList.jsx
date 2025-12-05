import { useAuth } from "../../context/AuthContext";
import LoginRequired from "../../components/LoginRequired";

function MyInvestList() {
    const { user } = useAuth();

    if (!user) return <LoginRequired />;
    return (
        <div className="invest-container">
            페이지 준비중입니다.
        </div>
    )
}

export default MyInvestList